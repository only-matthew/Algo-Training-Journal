#include <bits/stdc++.h>
using namespace std;
int main()
{
	map<string,int> mp;
	mp["WrongProblem"]=100;
	mp["SameProblem"]=30;
	mp["UnreasonableProblemArrangement"]=10;
	mp["UnreasonableLimitForProblem"]=5;
	mp["WeakTestsForProblem"]=3;
	mp["BadProblem"]=1;
	int t;
	cin>>t;
	while(t--)
	{
		int n,p;
		cin>>n>>p;
		int total=0;
		for(int i=0;i<n;i++)
		{
			string temp;
			cin>>temp;
			if(mp.find(temp)!=mp.end()&&temp[temp.size()-1]=='t')total+=mp[temp];
			else {
				if(temp[temp.size()-1]<='L'&&temp[temp.size()-1]>='A')
				{
					temp.erase(temp.begin()+temp.size()-1);
					if(mp.find(temp)!=mp.end()&&temp!="UnreasonableProblemArrangement")total+=mp[temp];
				}
			}
			
		}
		if(total>p) cout<<"Joker"<<endl;
		else cout<<"Judger"<<endl;
	}
}