#include<iostream>
#include<vector>
using namespace std;
vector<int>a[100010];
int main()
{
    int n,q;
    cin>>n>>q;
    for(int t=1;t<=q;t++)
    {
        int co;cin>>co;
        int i,j,k;
        if(co==1){
            cin>>i>>j>>k;
            if(a[i].size()<=j)
            {
                a[i].resize(j+1);
            }
            a[i][j]=k;
        }
        else{
            cin>>i>>j;
            cout<<a[i][j]<<endl;
        }
    }
    return 0;
}