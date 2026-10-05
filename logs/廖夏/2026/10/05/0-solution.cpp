#include<iostream>
#include<string>
#include<algorithm>
using namespace std;
const int MAXN = 105;
int n;
bool cnt[MAXN][MAXN];
char a[MAXN][MAXN];
int dx[] = {0, 0, 1, 1, 1, -1, -1, -1};
int dy[] = {1, -1, 0, 1, -1, 0, 1, -1};
string word = "yizhong";
int main(){
	cin >> n;
	for (int i = 1; i <= n; i++)
		for (int j = 1; j <= n; j++)
			cin >> a[i][j];
	for (int i = 1; i <= n; i++){
		for (int j = 1; j <= n; j++){
			// 下面枚举八个方向
			if (a[i][j] != 'y') continue;
			for (int k = 0; k < 8; k++){
				int x = i, y = j;
				bool flag = true;
				for (int m = 1; m < word.length(); m++){
					x += dx[k]; y += dy[k];	
					if (a[x][y] != word[m]) {flag = false; break;} 
				}
				if (flag){
					x = i, y = j;
					cnt[x][y] = 1;
					for (int m = 1; m < word.length(); m++){
						x += dx[k]; y += dy[k];	
						cnt[x][y] = 1;
					}
				}
			}
		}
	}
	for (int i = 1; i <= n; i++){
		for (int j = 1; j <= n; j++){
			if (cnt[i][j]) cout << a[i][j];
			else cout << "*";
		}
		cout << "\n";
	}
	return 0;
}