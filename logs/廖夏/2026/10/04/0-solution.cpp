#include<iostream>
#include<algorithm>
#include<string>
using namespace std;
const int MAXN = 25;
int used[MAXN], ans, n;
string words[MAXN];
int canlink(string now, string wd){
	for (int i = 1; i < min(now.length(), wd.length()); i++){
		bool flag = true;
		for (int j = 0; j < i; j++){
			if (now[now.length()-i+j] != wd[j]){flag = false; break;}
		}
		if (flag) return i;
	}
	return 0;
}
void dfs(string last, int len){
//	cout << last << endl;
	ans = max(ans, len);
	for (int i = 1; i <= n; i++){
		if (used[i] < 2){
			int tmp = canlink(last, words[i]);
			if (tmp){
				used[i]++;
				dfs(words[i], len + words[i].length() - tmp);
				used[i]--;
			}
		}
	}
}
int main(){
	cin >> n;
	for (int i = 1; i <= n; i++) cin >> words[i];
	string tmp;
	cin >> tmp;
	dfs(" " + tmp, tmp.length()); // 手动加一，避免在canlink中被i_initial = 1给跳过
	cout << ans;
	return 0;
}