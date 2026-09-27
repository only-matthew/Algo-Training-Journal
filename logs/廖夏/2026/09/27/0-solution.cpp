#include<iostream>
#include<algorithm>
#include<cstring>
#include<string>
using namespace std;
const int MAXN = 2e5 +5;
int n, k, t;
int f[MAXN];
int main(){
	cin >> t;
	while(t--){
		string s;
		memset(f, 0, sizeof(f));
		cin >> n >> k;
		cin >> s;
		int sum = 0;
		// cout << s << endl;
		for (int i = 0; i < n; i++){
			if (!k) break;
			if (sum >= k) {
				if (k % 2 == 1)
					if (s[i] == '1') s[i] = '0';
					else s[i] = '1';
				continue;
			}
			if (s[i] == '1' && k % 2 == 1)  f[i] = 1, sum++;
			else if (s[i] == '1' && k % 2 == 0) f[i] = 0;
			else if (s[i] == '0' && k % 2 == 1) f[i] = 0;
			else if (s[i] == '0' && k % 2 == 0) f[i] = 1, sum++;
			s[i] = '1'; 
		}
		f[n-1] += k - sum;
		if ((k - sum) % 2 == 1) s[n - 1] = '0';
		cout << s << endl;
		for (int i = 0; i < n; i++)
			cout << f[i] << " ";
		cout << endl;
	}
}